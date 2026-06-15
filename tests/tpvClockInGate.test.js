import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTpvClockInGate } from '../src/app/lib/tpvClockInGate.ts';

describe('evaluateTpvClockInGate', () => {
  it('blocks while loading', () => {
    const r = evaluateTpvClockInGate({
      loading: true,
      clockedInWorkers: [],
      selectedOrderTakerId: null,
      currentUserId: 'u1',
      isWorkerUser: false,
    });
    assert.equal(r.allowed, false);
    assert.equal(r.reason, 'loading');
  });

  it('allows manager when someone is active', () => {
    const r = evaluateTpvClockInGate({
      loading: false,
      clockedInWorkers: [{ id: 'u1', name: 'Ana', status: 'active' }],
      selectedOrderTakerId: 'u1',
      currentUserId: 'mgr',
      isWorkerUser: false,
    });
    assert.equal(r.allowed, true);
  });

  it('allows worker when self is active', () => {
    const r = evaluateTpvClockInGate({
      loading: false,
      clockedInWorkers: [{ id: 'u1', name: 'Ana', status: 'active' }],
      selectedOrderTakerId: null,
      currentUserId: 'u1',
      isWorkerUser: true,
    });
    assert.equal(r.allowed, true);
  });

  it('allows manager when someone is active (account: id prefix)', () => {
    const r = evaluateTpvClockInGate({
      loading: false,
      clockedInWorkers: [{ id: 'u1', name: 'Uriel', status: 'active' }],
      selectedOrderTakerId: 'account:u1',
      currentUserId: 'account:mgr',
      isWorkerUser: false,
    });
    assert.equal(r.allowed, true);
  });
});
