import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PRINTER_CONFIG, saveLegacyPrinterConfig } from '../src/app/lib/vertialPrint/printerConfig';
import {
  clearPrinterVerifiedHost,
  loadNativePrinterDiagnostics,
  readNativePrinterDiagnosticsSync,
  readPrinterVerifiedHost,
  writePrinterVerifiedHost,
} from '../src/app/lib/vertialPrint/nativePrinterDiagnostics';

function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
  });
  return store;
}

describe('nativePrinterDiagnostics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.doUnmock('../src/app/lib/vertialPrint/isNativeApp');
    vi.doUnmock('../src/app/lib/vertialPrint/escposPlugin');
  });

  it('readNativePrinterDiagnosticsSync detecta IP guardada', async () => {
    vi.resetModules();
    vi.doMock('../src/app/lib/vertialPrint/isNativeApp', () => ({
      isVertialNativeApp: () => true,
    }));
    stubLocalStorage();
    saveLegacyPrinterConfig({
      ...DEFAULT_PRINTER_CONFIG,
      connectionType: 'network',
      networkHost: '192.168.1.20',
    });
    const { readNativePrinterDiagnosticsSync: readSync } = await import(
      '../src/app/lib/vertialPrint/nativePrinterDiagnostics'
    );
    const diag = readSync();
    expect(diag.ready).toBe(true);
    expect(diag.savedHost).toBe('192.168.1.20');
  });

  it('loadNativePrinterDiagnostics marca misma subred', async () => {
    vi.resetModules();
    vi.doMock('../src/app/lib/vertialPrint/isNativeApp', () => ({
      isVertialNativeApp: () => true,
    }));
    vi.doMock('../src/app/lib/vertialPrint/escposPlugin', () => ({
      getNativeLocalNetworkInfo: async () => ({ ip: '192.168.1.45', prefix: '192.168.1' }),
    }));
    stubLocalStorage();
    saveLegacyPrinterConfig({
      ...DEFAULT_PRINTER_CONFIG,
      connectionType: 'network',
      networkHost: '192.168.1.20',
    });
    const { loadNativePrinterDiagnostics: loadDiag } = await import(
      '../src/app/lib/vertialPrint/nativePrinterDiagnostics'
    );
    const diag = await loadDiag();
    expect(diag.onWifi).toBe(true);
    expect(diag.sameSubnet).toBe(true);
    expect(diag.deviceIp).toBe('192.168.1.45');
  });

  it('writePrinterVerifiedHost persiste la IP verificada', () => {
    stubLocalStorage();
    writePrinterVerifiedHost('192.168.1.20');
    expect(readPrinterVerifiedHost()).toBe('192.168.1.20');
    clearPrinterVerifiedHost();
    expect(readPrinterVerifiedHost()).toBe('');
  });
});
