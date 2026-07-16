import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PRINTER_CONFIG,
  cacheServerPdvPrinterConfigs,
  saveLegacyPrinterConfig,
} from '../src/app/lib/vertialPrint/printerConfig';
import { resolveEffectivePrinterConfig } from '../src/app/lib/vertialPrint/printerActiveScope';
import type { PointOfSale } from '../src/app/lib/deliveryApi';

function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
  });
  return store;
}

const basePdv = (overrides: Partial<PointOfSale> = {}): PointOfSale => ({
  _id: 'pdv-1',
  type: 'point_of_sale',
  id: 'pdv-1',
  user_id: 'user-1',
  name: 'Tienda',
  code: 'T1',
  address: 'Calle Mayor 1',
  terminals: [{
    id: 'term-1',
    code: 'Caja 1',
    name: 'Principal',
    datafonName: '',
    printerName: '',
    scaleDeviceId: '',
    scaleName: '',
    active: true,
  }],
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('resolveEffectivePrinterConfig', () => {
  it('usa la impresora de la tienda cuando no hay override de terminal', () => {
    const pdv = basePdv({
      printerConfig: {
        ...DEFAULT_PRINTER_CONFIG,
        connectionType: 'network',
        networkHost: '192.168.0.10',
      },
    });
    const cfg = resolveEffectivePrinterConfig({ pdv, terminalId: 'term-1' });
    expect(cfg.networkHost).toBe('192.168.0.10');
  });

  it('prioriza la impresora del terminal sobre la de la tienda', () => {
    const pdv = basePdv({
      printerConfig: {
        ...DEFAULT_PRINTER_CONFIG,
        connectionType: 'network',
        networkHost: '192.168.0.10',
      },
      terminals: [{
        id: 'term-1',
        code: 'Caja 1',
        name: 'Principal',
        datafonName: '',
        printerName: '',
        scaleDeviceId: '',
        scaleName: '',
        active: true,
        printerConfig: {
          ...DEFAULT_PRINTER_CONFIG,
          connectionType: 'network',
          networkHost: '192.168.0.20',
        },
      }],
    });
    const cfg = resolveEffectivePrinterConfig({ pdv, terminalId: 'term-1' });
    expect(cfg.networkHost).toBe('192.168.0.20');
  });
});

describe('cacheServerPdvPrinterConfigs + resolución por pdvId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resuelve la impresora del PDV del pedido desde la caché sincronizada del servidor', () => {
    stubLocalStorage();
    cacheServerPdvPrinterConfigs([
      { _id: 'pdv-9', printerConfig: { connectionType: 'network', networkHost: '192.168.1.77', networkPort: 9100 } },
    ]);
    const cfg = resolveEffectivePrinterConfig({ pdvId: 'pdv-9' });
    expect(cfg.connectionType).toBe('network');
    expect(cfg.networkHost).toBe('192.168.1.77');
    expect(cfg.networkPort).toBe(9100);
  });

  it('no cachea configuraciones que no son de red (no sirven para imprimir desde el móvil)', () => {
    const store = stubLocalStorage();
    cacheServerPdvPrinterConfigs([
      { _id: 'pdv-sys', printerConfig: { connectionType: 'system', systemPrinterName: 'HP' } },
      { _id: 'pdv-vacio', printerConfig: { connectionType: 'network', networkHost: '' } },
      { _id: 'pdv-null', printerConfig: null },
    ]);
    expect(store.size).toBe(0);
  });
});

describe('resolveEffectivePrinterConfig en app nativa', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.doUnmock('../src/app/lib/vertialPrint/isNativeApp');
  });

  it('prioriza la IP guardada en el dispositivo sobre la IP de la tienda en el servidor', async () => {
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
    const { resolveEffectivePrinterConfig: resolveNative } = await import(
      '../src/app/lib/vertialPrint/printerActiveScope'
    );
    const pdv = basePdv({
      printerConfig: {
        ...DEFAULT_PRINTER_CONFIG,
        connectionType: 'network',
        networkHost: '192.168.1.99',
      },
    });
    const cfg = resolveNative({ pdv, localFallback: {
      ...DEFAULT_PRINTER_CONFIG,
      connectionType: 'network',
      networkHost: '192.168.1.20',
    } });
    expect(cfg.networkHost).toBe('192.168.1.20');
  });

  it('en app nativa la IP del dispositivo manda sobre la del terminal', async () => {
    vi.resetModules();
    vi.doMock('../src/app/lib/vertialPrint/isNativeApp', () => ({
      isVertialNativeApp: () => true,
    }));
    stubLocalStorage();
    const localCfg = {
      ...DEFAULT_PRINTER_CONFIG,
      connectionType: 'network' as const,
      networkHost: '192.168.1.20',
    };
    saveLegacyPrinterConfig(localCfg);
    const { resolveEffectivePrinterConfig: resolveNative } = await import(
      '../src/app/lib/vertialPrint/printerActiveScope'
    );
    const pdv = basePdv({
      terminals: [{
        id: 'term-1',
        code: 'Caja 1',
        name: 'Principal',
        datafonName: '',
        printerName: '',
        scaleDeviceId: '',
        scaleName: '',
        active: true,
        printerConfig: {
          ...DEFAULT_PRINTER_CONFIG,
          connectionType: 'network',
          networkHost: '192.168.1.77',
        },
      }],
    });
    const cfg = resolveNative({ pdv, terminalId: 'term-1', localFallback: localCfg });
    expect(cfg.networkHost).toBe('192.168.1.20');
  });
});
