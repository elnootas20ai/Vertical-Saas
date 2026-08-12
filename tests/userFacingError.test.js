import { describe, expect, it } from 'vitest';

// authApi lee localStorage al importar (vía userFacingError).
{
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: () => null,
    get length() { return store.size; },
  };
}

const { toUserFacingMessage, TPV_SAFE_ERROR_FALLBACK } = await import('../src/app/lib/userFacingError.ts');

describe('toUserFacingMessage', () => {
  it('never shows "Error interno del servidor" to staff', () => {
    expect(toUserFacingMessage(new Error('Error interno del servidor'))).toBe(TPV_SAFE_ERROR_FALLBACK);
    expect(toUserFacingMessage('Internal Server Error')).toBe(TPV_SAFE_ERROR_FALLBACK);
    expect(toUserFacingMessage({ error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } }))
      .toBe(TPV_SAFE_ERROR_FALLBACK);
  });

  it('keeps useful business messages', () => {
    expect(toUserFacingMessage(new Error('Ya hay una caja abierta en Tiana'))).toBe(
      'Ya hay una caja abierta en esa tienda.',
    );
    expect(toUserFacingMessage(new Error('Abre la caja de la tienda antes de cobrar'))).toBe(
      'Abre la caja de la tienda antes de cobrar.',
    );
  });

  it('maps network failures', () => {
    expect(toUserFacingMessage(new TypeError('Failed to fetch'))).toMatch(/conexión/i);
  });
});
