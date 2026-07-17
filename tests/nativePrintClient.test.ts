import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withNativeCallTimeout } from '../src/app/lib/vertialPrint/nativeCallTimeout';
import { buildOrderedLanPrefixes } from '../src/app/lib/vertialPrint/nativePrintClient';

describe('buildOrderedLanPrefixes', () => {
  it('prioriza la subred de la IP indicada', () => {
    expect(buildOrderedLanPrefixes('192.168.50.42')[0]).toBe('192.168.50');
    expect(buildOrderedLanPrefixes('192.168.50.42').includes('192.168.1')).toBe(true);
  });

  it('usa el orden habitual sin hint', () => {
    expect(buildOrderedLanPrefixes()[0]).toBe('192.168.1');
  });
});

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
    await expect(result).resolves.toMatch(/no respondió a tiempo|tardó demasiado/i);
  });

  it('resuelve si la promesa termina antes del timeout', async () => {
    const pending = withNativeCallTimeout(Promise.resolve('ok'), 1000, 'Impresión');
    await expect(pending).resolves.toBe('ok');
  });
});
