import { describe, expect, it } from 'vitest';
import { shouldSkipFailedLoginIncrement } from '../services/couchdb.js';

describe('login lockout — no contar aciertos ni carreras', () => {
  it('no salta el incremento si no hay lastLoginAt', () => {
    expect(shouldSkipFailedLoginIncrement({ failedLoginAttempts: 2 }, '2026-07-18T12:00:00.000Z')).toBe(false);
  });

  it('salta el incremento si hubo login correcto después de empezar el intento fallido', () => {
    expect(
      shouldSkipFailedLoginIncrement(
        { lastLoginAt: '2026-07-18T12:00:05.000Z', failedLoginAttempts: 0 },
        '2026-07-18T12:00:00.000Z',
      ),
    ).toBe(true);
  });

  it('no salta si el lastLoginAt es anterior al intento fallido', () => {
    expect(
      shouldSkipFailedLoginIncrement(
        { lastLoginAt: '2026-07-18T11:00:00.000Z', failedLoginAttempts: 3 },
        '2026-07-18T12:00:00.000Z',
      ),
    ).toBe(false);
  });
});
