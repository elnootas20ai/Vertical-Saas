import { describe, expect, it } from 'vitest';
import { DEFAULT_PRINTER_CONFIG } from '../src/app/lib/vertialPrint/printerConfig';
import { resolveEffectivePrinterConfig } from '../src/app/lib/vertialPrint/printerActiveScope';
import type { PointOfSale } from '../src/app/lib/deliveryApi';

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
