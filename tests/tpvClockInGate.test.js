import { describe, expect, it } from 'vitest';
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
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('loading');
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
});
