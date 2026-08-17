import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PRINTER_CONFIG,
  cacheServerPdvPrinterConfigs,
  saveLegacyPrinterConfig,
} from '../src/app/lib/vertialPrint/printerConfig';
import {
  clearActivePrinterScope,
  resolveEffectivePrinterConfig,
  resolvePrinterConfigForOrderPdv,
  setActivePrinterScope,
} from '../src/app/lib/vertialPrint/printerActiveScope';
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
    clearActivePrinterScope();
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

  it('con scope en tienda-1, pdvId de tienda-2 usa la caché de la 2 (no la IP activa)', () => {
    stubLocalStorage();
    cacheServerPdvPrinterConfigs([
      { _id: 'pdv-1', printerConfig: { connectionType: 'network', networkHost: '192.168.0.10', networkPort: 9100 } },
      { _id: 'pdv-2', printerConfig: { connectionType: 'network', networkHost: '192.168.0.20', networkPort: 9100 } },
    ]);
    setActivePrinterScope({
      pdvId: 'pdv-1',
      pdv: basePdv({
        _id: 'pdv-1',
        printerConfig: {
          ...DEFAULT_PRINTER_CONFIG,
          connectionType: 'network',
          networkHost: '192.168.0.10',
        },
      }),
    });
    const cfg = resolveEffectivePrinterConfig({ pdvId: 'pdv-2' });
    expect(cfg.networkHost).toBe('192.168.0.20');
  });

  it('pedido de la 2ª tienda imprime en su impresora aunque el scope sea la 1ª', () => {
    stubLocalStorage();
    cacheServerPdvPrinterConfigs([
      { _id: 'pdv-1', printerConfig: { connectionType: 'network', networkHost: '192.168.0.10', networkPort: 9100 } },
      { _id: 'pdv-2', printerConfig: { connectionType: 'network', networkHost: '192.168.0.20', networkPort: 9100 } },
    ]);
    setActivePrinterScope({
      pdvId: 'pdv-1',
      pdv: basePdv({
        _id: 'pdv-1',
        printerConfig: {
          ...DEFAULT_PRINTER_CONFIG,
          connectionType: 'network',
          networkHost: '192.168.0.10',
        },
      }),
    });
    expect(resolvePrinterConfigForOrderPdv('pdv-2').networkHost).toBe('192.168.0.20');
    expect(resolvePrinterConfigForOrderPdv('pdv-1').networkHost).toBe('192.168.0.10');
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

  it('la IP de tienda manda y se copia a esta tablet (1 impresora, N tablets)', async () => {
    stubLocalStorage();
    const {
      cachePdvDevicePrinterConfig,
      loadPdvDevicePrinterCache,
      DEFAULT_PRINTER_CONFIG: DEF,
    } = await import('../src/app/lib/vertialPrint/printerConfig');
    cachePdvDevicePrinterConfig('pdv-tiana', {
      ...DEF,
      connectionType: 'network',
      networkHost: '192.168.1.20',
      networkPort: 9100,
    });
    cacheServerPdvPrinterConfigs([
      { _id: 'pdv-tiana', printerConfig: { connectionType: 'network', networkHost: '192.168.1.99', networkPort: 9100 } },
    ]);
    // Espejo de servidor no pisa la caché dispositivo por sí solo…
    expect(loadPdvDevicePrinterCache('pdv-tiana')?.networkHost).toBe('192.168.1.20');
    setActivePrinterScope({
      pdvId: 'pdv-tiana',
      pdv: basePdv({
        _id: 'pdv-tiana',
        printerConfig: {
          ...DEF,
          connectionType: 'network',
          networkHost: '192.168.1.99',
        },
      }),
    });
    // …pero al resolver con el PDV de tienda, manda la IP de tienda (tablet buena).
    expect(resolveEffectivePrinterConfig({ pdvId: 'pdv-tiana' }).networkHost).toBe('192.168.1.99');
    expect(loadPdvDevicePrinterCache('pdv-tiana')?.networkHost).toBe('192.168.1.99');
  });
});

describe('resolveEffectivePrinterConfig en app nativa', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.doUnmock('../src/app/lib/vertialPrint/isNativeApp');
  });

  it('prioriza la IP de la tienda (1 impresora compartida por tablets)', async () => {
    vi.resetModules();
    vi.doMock('../src/app/lib/vertialPrint/isNativeApp', () => ({
      isVertialNativeApp: () => true,
    }));
    stubLocalStorage();
    const {
      cachePdvDevicePrinterConfig,
      DEFAULT_PRINTER_CONFIG: DEF,
    } = await import('../src/app/lib/vertialPrint/printerConfig');
    cachePdvDevicePrinterConfig('pdv-1', {
      ...DEF,
      connectionType: 'network',
      networkHost: '192.168.1.20',
    });
    const { resolveEffectivePrinterConfig: resolveNative } = await import(
      '../src/app/lib/vertialPrint/printerActiveScope'
    );
    const pdv = basePdv({
      printerConfig: {
        ...DEF,
        connectionType: 'network',
        networkHost: '192.168.1.99',
      },
    });
    const cfg = resolveNative({ pdv });
    expect(cfg.networkHost).toBe('192.168.1.99');
  });

  it('si la tienda no tiene IP, usa la de esta tablet (legacy)', async () => {
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
      printerConfig: undefined,
    });
    const cfg = resolveNative({ pdv, localFallback: {
      ...DEFAULT_PRINTER_CONFIG,
      connectionType: 'network',
      networkHost: '192.168.1.20',
    } });
    expect(cfg.networkHost).toBe('192.168.1.20');
  });

  it('prioriza la IP de la tienda solo si ESTA tablet no tiene IP local', async () => {
    vi.resetModules();
    vi.doMock('../src/app/lib/vertialPrint/isNativeApp', () => ({
      isVertialNativeApp: () => true,
    }));
    stubLocalStorage();
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
    const cfg = resolveNative({
      pdv,
      localFallback: {
        ...DEFAULT_PRINTER_CONFIG,
        connectionType: 'network',
        networkHost: '',
      },
    });
    expect(cfg.networkHost).toBe('192.168.1.99');
  });

  it('sin IP en tienda, usa legacy de esta tablet; el terminal no pisa si no hace falta', async () => {
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
      printerConfig: undefined,
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
    // Con terminal configurado, el terminal sigue mandando sobre legacy.
    const cfg = resolveNative({ pdv, terminalId: 'term-1', localFallback: localCfg });
    expect(cfg.networkHost).toBe('192.168.1.77');
  });

  it('sin IP en esta tablet, usa la del terminal', async () => {
    vi.resetModules();
    vi.doMock('../src/app/lib/vertialPrint/isNativeApp', () => ({
      isVertialNativeApp: () => true,
    }));
    stubLocalStorage();
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
    const cfg = resolveNative({
      pdv,
      terminalId: 'term-1',
      localFallback: {
        ...DEFAULT_PRINTER_CONFIG,
        connectionType: 'network',
        networkHost: '',
      },
    });
    expect(cfg.networkHost).toBe('192.168.1.77');
  });

  it('usa la IP del dispositivo si la tienda no tiene impresora configurada', async () => {
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
    const pdv = basePdv();
    const cfg = resolveNative({ pdv, localFallback: localCfg });
    expect(cfg.networkHost).toBe('192.168.1.20');
  });
});
