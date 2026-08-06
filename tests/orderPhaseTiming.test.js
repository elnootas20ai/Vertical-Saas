import { describe, expect, it } from 'vitest';
import {
  estimateAssemblyMinutes,
  estimateOneWayDeliveryMinutes,
  minutesBetweenIso,
} from '../shared/delivery/orderPhaseTiming.js';

describe('orderPhaseTiming', () => {
  it('minutesBetweenIso returns minutes', () => {
    expect(minutesBetweenIso('2026-08-06T10:00:00.000Z', '2026-08-06T10:20:00.000Z')).toBe(20);
  });

  it('estimateAssemblyMinutes uses assembly anchors', () => {
    expect(
      estimateAssemblyMinutes({
        createdAt: '2026-08-06T10:00:00.000Z',
        assemblyStartedAt: '2026-08-06T10:01:00.000Z',
        assemblyCompletedAt: '2026-08-06T10:11:00.000Z',
      }),
    ).toBe(10);
  });

  it('estimateOneWayDeliveryMinutes halves round trip', () => {
    expect(
      estimateOneWayDeliveryMinutes({
        deliveryType: 'domicilio',
        departedAt: '2026-08-06T10:00:00.000Z',
        deliveredAt: '2026-08-06T10:40:00.000Z',
      }),
    ).toBe(20);
  });

  it('estimateOneWayDeliveryMinutes skips recogida', () => {
    expect(
      estimateOneWayDeliveryMinutes({
        deliveryType: 'recogida',
        departedAt: '2026-08-06T10:00:00.000Z',
        deliveredAt: '2026-08-06T10:40:00.000Z',
      }),
    ).toBeNull();
  });
});
