import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTpvActiveStaff } from '../src/app/lib/tpvClockedInWorkers.ts';

describe('buildTpvActiveStaff', () => {
  it('includes session opener even without clockins', () => {
    const staff = buildTpvActiveStaff(
      { workerId: 'account:u1', workerName: 'Ana' },
      [],
    );
    assert.equal(staff.length, 1);
    assert.equal(staff[0].id, 'u1');
    assert.equal(staff[0].name, 'Ana');
    assert.equal(staff[0].status, 'active');
  });

  it('merges opener with store clockins without duplicates', () => {
    const staff = buildTpvActiveStaff(
      { workerId: 'u1', workerName: 'Ana' },
      [{ id: 'u1', name: 'Ana Fichada', status: 'break' }, { id: 'u2', name: 'Luis', status: 'active' }],
    );
    assert.equal(staff.length, 2);
    assert.equal(staff.find((w) => w.id === 'u1')?.status, 'break');
    assert.equal(staff.find((w) => w.id === 'u2')?.name, 'Luis');
  });
});
