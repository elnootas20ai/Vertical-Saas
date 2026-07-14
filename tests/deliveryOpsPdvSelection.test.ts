import { describe, expect, it } from 'vitest';
import {
  pickDefaultActiveStorePreference,
  pickDefaultWorkCenterPreference,
} from '../src/app/lib/deliveryOpsPdvSelection.ts';

describe('deliveryOpsPdvSelection defaults', () => {
  it('prefers oldest active PDV', () => {
    const pref = pickDefaultActiveStorePreference(
      [
        { _id: 'pdv-b', createdAt: '2025-02-01T00:00:00.000Z', active: true },
        { _id: 'pdv-a', createdAt: '2025-01-01T00:00:00.000Z', active: true },
      ],
      [],
    );
    expect(pref).toBe('pdv-a');
  });

  it('falls back to oldest work center when no PDV exists', () => {
    const pref = pickDefaultActiveStorePreference(
      [],
      [
        { _id: 'wc-bodegeta', createdAt: '2025-01-01T00:00:00.000Z', active: true },
      ],
    );
    expect(pref).toBe('wc:wc-bodegeta');
  });

  it('pickDefaultWorkCenterPreference ignores deleted centers', () => {
    const pref = pickDefaultWorkCenterPreference([
      { _id: 'wc-old', createdAt: '2024-01-01T00:00:00.000Z', deletedAt: '2025-01-01' },
      { _id: 'wc-live', createdAt: '2025-01-01T00:00:00.000Z', active: true },
    ]);
    expect(pref).toBe('wc:wc-live');
  });
});
