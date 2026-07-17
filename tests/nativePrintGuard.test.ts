import { describe, expect, it } from 'vitest';
import {
  assertNativePrintTarget,
  sanitizePrinterPort,
} from '../src/app/lib/vertialPrint/nativePrintGuard';

describe('sanitizePrinterPort', () => {
  it('usa 9100 por defecto si el valor no es válido', () => {
    expect(sanitizePrinterPort(undefined)).toBe(9100);
    expect(sanitizePrinterPort('')).toBe(9100);
    expect(sanitizePrinterPort(0)).toBe(9100);
    expect(sanitizePrinterPort(99999)).toBe(9100);
  });

  it('acepta puertos válidos', () => {
    expect(sanitizePrinterPort(9100)).toBe(9100);
    expect(sanitizePrinterPort('9101')).toBe(9101);
  });
});

describe('assertNativePrintTarget', () => {
  it('exige IP válida', () => {
    const bad = assertNativePrintTarget('', 9100);
    expect(bad.ok).toBe(false);
  });

  it('acepta IP y puerto', () => {
    const ok = assertNativePrintTarget('192.168.1.20', 9100, new Uint8Array([1, 2, 3]));
    expect(ok).toEqual({ ok: true, host: '192.168.1.20', port: 9100 });
  });

  it('rechaza payload vacío', () => {
    const empty = assertNativePrintTarget('192.168.1.20', 9100, new Uint8Array());
    expect(empty.ok).toBe(false);
  });
});
