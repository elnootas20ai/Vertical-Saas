import { describe, expect, it } from 'vitest';
import { evaluateTpvClockInGate } from '../src/app/lib/tpvClockInGate.ts';

describe('evaluateTpvClockInGate', () => {
  it('blocks while loading with no workers yet', () => {
    const r = evaluateTpvClockInGate({
      loading: true,
      clockedInWorkers: [],
      selectedOrderTakerId: null,
      currentUserId: 'u1',
      isWorkerUser: false,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('loading');
  });

  it('allows during silent refresh when workers already visible', () => {
    const r = evaluateTpvClockInGate({
      loading: true,
      clockedInWorkers: [{ id: 'u1', name: 'Ana', status: 'active' }],
      selectedOrderTakerId: 'u1',
      currentUserId: 'mgr',
      isWorkerUser: false,
    });
    expect(r.allowed).toBe(true);
  });

  it('allows manager when someone is active', () => {
    const r = evaluateTpvClockInGate({
      loading: false,
      clockedInWorkers: [{ id: 'u1', name: 'Ana', status: 'active' }],
      selectedOrderTakerId: 'u1',
      currentUserId: 'mgr',
      isWorkerUser: false,
    });
    expect(r.allowed).toBe(true);
  });

  it('allows worker when self is active', () => {
    const r = evaluateTpvClockInGate({
      loading: false,
      clockedInWorkers: [{ id: 'u1', name: 'Ana', status: 'active' }],
      selectedOrderTakerId: null,
      currentUserId: 'u1',
      isWorkerUser: true,
    });
    expect(r.allowed).toBe(true);
  });

  it('allows manager when someone is active (account: id prefix)', () => {
    const r = evaluateTpvClockInGate({
      loading: false,
      clockedInWorkers: [{ id: 'u1', name: 'Uriel', status: 'active' }],
      selectedOrderTakerId: 'account:u1',
      currentUserId: 'account:mgr',
      isWorkerUser: false,
    });
    expect(r.allowed).toBe(true);
  });

  it('blocks worker on approved vacation', () => {
    const r = evaluateTpvClockInGate({
      loading: false,
      clockedInWorkers: [{ id: 'u1', name: 'Ana', status: 'active' }],
      selectedOrderTakerId: null,
      currentUserId: 'u1',
      isWorkerUser: true,
      vacationBlockedIds: ['u1'],
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('vacation_blocked');
  });

  it('blocks manager when selected taker is on vacation', () => {
    const r = evaluateTpvClockInGate({
      loading: false,
      clockedInWorkers: [
        { id: 'u1', name: 'Ana', status: 'active' },
        { id: 'u2', name: 'Luis', status: 'active' },
      ],
      selectedOrderTakerId: 'u1',
      currentUserId: 'mgr',
      isWorkerUser: false,
      vacationBlockedIds: ['u1'],
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('vacation_blocked');
  });
});
