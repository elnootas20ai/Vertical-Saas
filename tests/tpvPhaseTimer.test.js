import { describe, expect, it } from 'vitest';
import { getTpvPhaseTimer } from '../src/app/lib/deliveryOpsLiveTimes.ts';

function baseOrder(overrides = {}) {
  return {
    _id: 'o1',
    orderNumber: '1',
    status: 'listo',
    createdAt: '2026-07-21T10:00:00.000Z',
    items: [],
    ...overrides,
  };
}

describe('getTpvPhaseTimer', () => {
  const now = Date.parse('2026-07-21T10:20:00.000Z');

  it('montaje cuenta desde assemblyStartedAt', () => {
    const t = getTpvPhaseTimer(
      baseOrder({
        status: 'listo',
        assemblyStartedAt: '2026-07-21T10:12:00.000Z',
      }),
      now,
    );
    expect(t.kind).toBe('montaje');
    expect(t.label).toBe('Montaje');
    expect(t.minutes).toBe(8);
  });

  it('reparto cuenta desde departedAt (reinicia el reloj)', () => {
    const t = getTpvPhaseTimer(
      baseOrder({
        status: 'en_reparto',
        assemblyStartedAt: '2026-07-21T10:05:00.000Z',
        departedAt: '2026-07-21T10:15:00.000Z',
      }),
      now,
    );
    expect(t.kind).toBe('reparto');
    expect(t.label).toBe('Reparto');
    expect(t.minutes).toBe(5);
  });

  it('tablet sin assemblyStartedAt usa kitchenCompletedAt', () => {
    const t = getTpvPhaseTimer(
      baseOrder({
        status: 'listo',
        kitchenCompletedAt: '2026-07-21T10:10:00.000Z',
      }),
      now,
    );
    expect(t.kind).toBe('montaje');
    expect(t.minutes).toBe(10);
  });
});
