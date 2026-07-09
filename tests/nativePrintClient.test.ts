import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withNativeCallTimeout } from '../src/app/lib/vertialPrint/nativeCallTimeout';

describe('withNativeCallTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rechaza si la promesa no responde a tiempo', async () => {
    const pending = withNativeCallTimeout(
      new Promise<string>(() => {}),
      1000,
      'Impresión',
    );

    const result = pending.catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toMatch(/tardó demasiado/i);
  });

  it('resuelve si la promesa termina antes del timeout', async () => {
    const pending = withNativeCallTimeout(Promise.resolve('ok'), 1000, 'Impresión');
    await expect(pending).resolves.toBe('ok');
  });
});
