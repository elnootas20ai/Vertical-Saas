import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isWorkerLikeAccount,
  isLoginLockoutEnabledForAccount,
  isAccountLocked,
} from '../services/couchdb.js';

describe('login lockout · trabajadores', () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    for (const key of ['NODE_ENV', 'LOGIN_LOCKOUT_ENABLED']) {
      if (prevEnv[key] === undefined) delete process.env[key];
      else process.env[key] = prevEnv[key];
    }
  });

  it('detecta trabajador por accountType e invitedBy', () => {
    assert.equal(isWorkerLikeAccount({ accountType: 'user' }), true);
    assert.equal(isWorkerLikeAccount({ accountType: 'company', invitedBy: 'owner-1' }), true);
    assert.equal(isWorkerLikeAccount({ accountType: 'company', invitedBy: '' }), false);
  });

  it('nunca aplica lockout a trabajadores', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOGIN_LOCKOUT_ENABLED = 'true';
    const worker = {
      accountType: 'user',
      invitedBy: 'owner-1',
      lockUntil: new Date(Date.now() + 60 * 60_000).toISOString(),
    };
    assert.equal(isLoginLockoutEnabledForAccount(worker), false);
    assert.equal(isAccountLocked(worker).locked, false);
  });

  it('en desarrollo no bloquea cuentas empresa', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.LOGIN_LOCKOUT_ENABLED;
    const company = {
      accountType: 'company',
      lockUntil: new Date(Date.now() + 60 * 60_000).toISOString(),
    };
    assert.equal(isLoginLockoutEnabledForAccount(company), false);
    assert.equal(isAccountLocked(company).locked, false);
  });

  it('en producción puede bloquear empresa si hay lockUntil', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOGIN_LOCKOUT_ENABLED = 'true';
    const company = {
      accountType: 'company',
      lockUntil: new Date(Date.now() + 60 * 60_000).toISOString(),
    };
    assert.equal(isLoginLockoutEnabledForAccount(company), true);
    assert.equal(isAccountLocked(company).locked, true);
  });
});
