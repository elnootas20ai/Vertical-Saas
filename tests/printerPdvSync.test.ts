// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const updatePointOfSaleRequest = vi.fn();
const listPointsOfSaleRequest = vi.fn();

vi.mock('../src/app/lib/deliveryApi', () => ({
  updatePointOfSaleRequest: (...args: unknown[]) => updatePointOfSaleRequest(...args),
  listPointsOfSaleRequest: (...args: unknown[]) => listPointsOfSaleRequest(...args),
}));

import { savePrinterConfigToPdv } from '../src/app/lib/vertialPrint/printerPdvSync';
import { DEFAULT_PRINTER_CONFIG } from '../src/app/lib/vertialPrint/printerConfig';

const wifiConfig = {
  ...DEFAULT_PRINTER_CONFIG,
  connectionType: 'network' as const,
  networkHost: '192.168.1.50',
};

function pdvBase(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'pdv-1',
    _rev: 'stale-rev',
    name: 'Tienda',
    terminals: [],
    ...overrides,
  } as never;
}

beforeEach(() => {
  updatePointOfSaleRequest.mockReset().mockImplementation(async (_uid, payload) => {
    const p = payload as { _id?: string; printerConfig?: unknown };
    return {
      ...(payload as object),
      _id: p._id || 'pdv-1',
      _rev: 'new-rev',
      name: 'Tienda',
      printerConfig: p.printerConfig || wifiConfig,
    };
  });
  listPointsOfSaleRequest.mockReset().mockResolvedValue([
    { _id: 'pdv-1', name: 'Tienda', printerConfig: wifiConfig, terminals: [] },
  ]);
  localStorage.clear();
});

describe('savePrinterConfigToPdv', () => {
  it('guardar en tienda envía solo _id + printerConfig (no rompe con PDV cacheado sin terminales)', async () => {
    await savePrinterConfigToPdv('user-1', pdvBase(), wifiConfig, 'store');

    expect(updatePointOfSaleRequest).toHaveBeenCalledTimes(1);
    const payload = updatePointOfSaleRequest.mock.calls[0][1] as Record<string, unknown>;
    expect(payload._id).toBe('pdv-1');
    expect(payload.printerConfig).toMatchObject({ connectionType: 'network', networkHost: '192.168.1.50' });
    // Nunca reenviar campos que el backend valida y que la caché puede traer incompletos.
    expect(payload).not.toHaveProperty('terminals');
    expect(payload).not.toHaveProperty('address');
    expect(payload).not.toHaveProperty('name');
  });

  it('guardar en terminal con caché incompleta refresca los terminales del servidor', async () => {
    listPointsOfSaleRequest.mockResolvedValue([
      {
        _id: 'pdv-1',
        terminals: [
          { id: 'term-1', code: 'TPV-01', name: 'Caja principal', active: true },
          { id: 'term-2', code: 'TPV-02', name: 'Barra', active: true },
        ],
      },
    ]);

    await savePrinterConfigToPdv('user-1', pdvBase(), wifiConfig, 'terminal', 'term-2');

    expect(listPointsOfSaleRequest).toHaveBeenCalled();
    const payload = updatePointOfSaleRequest.mock.calls[0][1] as {
      terminals: Array<{ id: string; printerConfig?: unknown }>;
    };
    expect(payload.terminals).toHaveLength(2);
    expect(payload.terminals.find((t) => t.id === 'term-2')?.printerConfig).toBeTruthy();
    expect(payload.terminals.find((t) => t.id === 'term-1')?.printerConfig).toBeUndefined();
  });

  it('guardar en terminal falla con mensaje claro si no hay terminales ni en el servidor', async () => {
    listPointsOfSaleRequest.mockResolvedValue([{ _id: 'pdv-1', terminals: [] }]);

    await expect(
      savePrinterConfigToPdv('user-1', pdvBase(), wifiConfig, 'terminal', 'term-1'),
    ).rejects.toThrow(/No se pudieron cargar los TPV/);
    expect(updatePointOfSaleRequest).not.toHaveBeenCalled();
  });
});
