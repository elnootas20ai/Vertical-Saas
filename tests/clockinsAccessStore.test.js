import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canAccessStoreClockins,
  canMutateClockinForMember,
  normalizeClockinUserId,
  isMemberAssignedToSalesPoint,
} from '../services/clockinsAccess.js';

describe('clockinsAccess store TPV', () => {
  const business = {
    owner_user_id: 'owner-1',
    members: [
      { user_id: 'worker-1', role: 'Usuario', status: 'active' },
      { user_id: 'worker-2', role: 'Usuario', status: 'active' },
      { user_id: 'account:admin-1', role: 'Admin', status: 'active' },
    ],
  };

  const pdvA = 'pdv-a';
  const pdvB = 'pdv-b';

  it('normalizeClockinUserId strips account prefix', () => {
    assert.equal(normalizeClockinUserId('account:abc'), 'abc');
    assert.equal(normalizeClockinUserId('abc'), 'abc');
  });

  it('owner can fichar and access store clockins', () => {
    assert.equal(canMutateClockinForMember(business, 'owner-1', 'worker-1'), true);
    assert.equal(canAccessStoreClockins(business, 'owner-1'), true);
    assert.equal(isMemberAssignedToSalesPoint(business, 'owner-1', pdvA, '', '', ''), true);
  });

  it('admin with account prefix can access store clockins', () => {
    assert.equal(canAccessStoreClockins(business, 'account:admin-1'), true);
    assert.equal(canMutateClockinForMember(business, 'account:admin-1', 'worker-1'), true);
    assert.equal(isMemberAssignedToSalesPoint(business, 'account:admin-1', pdvA, '', '', 'Admin'), true);
  });

  it('worker can only fichar self', () => {
    assert.equal(canMutateClockinForMember(business, 'worker-1', 'worker-1'), true);
    assert.equal(canMutateClockinForMember(business, 'worker-1', 'owner-1'), false);
    assert.equal(canAccessStoreClockins(business, 'worker-1'), true);
  });

  it('worker assigned to store A cannot fichar at store B', () => {
    assert.equal(
      isMemberAssignedToSalesPoint(business, 'worker-1', pdvA, '', pdvA, 'Usuario'),
      true,
    );
    assert.equal(
      isMemberAssignedToSalesPoint(business, 'worker-1', pdvB, '', pdvA, 'Usuario'),
      false,
    );
  });

  it('worker without store assignment cannot fichar at any PDV', () => {
    assert.equal(
      isMemberAssignedToSalesPoint(business, 'worker-2', pdvA, '', '', 'Usuario'),
      false,
    );
  });
});
