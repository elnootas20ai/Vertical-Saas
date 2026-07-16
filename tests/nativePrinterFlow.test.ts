import { describe, expect, it, vi, afterEach } from 'vitest';
import { DEFAULT_PRINTER_CONFIG } from '../src/app/lib/vertialPrint/printerConfig';

describe('resolveNativePrinterForPrint', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('falla en nativo si no hay IP configurada', async () => {
    vi.doMock('../src/app/lib/vertialPrint/isNativeApp', () => ({
      isVertialNativeApp: () => true,
    }));
    const { resolveNativePrinterForPrint } = await import('../src/app/lib/vertialPrint/nativePrinterFlow');
    const result = resolveNativePrinterForPrint({
      ...DEFAULT_PRINTER_CONFIG,
      connectionType: 'network',
      networkHost: '',
    });
    expect(result.ready).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('listo en nativo cuando hay IP válida (sin pedir permisos automáticos)', async () => {
    vi.doMock('../src/app/lib/vertialPrint/isNativeApp', () => ({
      isVertialNativeApp: () => true,
    }));
    const { resolveNativePrinterForPrint } = await import('../src/app/lib/vertialPrint/nativePrinterFlow');
    const result = resolveNativePrinterForPrint({
      ...DEFAULT_PRINTER_CONFIG,
      connectionType: 'network',
      networkHost: '192.168.1.20',
    });
    expect(result.ready).toBe(true);
    expect(result.config.networkHost).toBe('192.168.1.20');
  });
});
