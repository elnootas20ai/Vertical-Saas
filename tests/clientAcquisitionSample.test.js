import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/app/lib/crmApi', () => ({
  listClientsPageRequest: vi.fn(),
}));

import { listClientsPageRequest } from '../src/app/lib/crmApi';
import {
  CLIENT_ACQUISITION_SAMPLE_MAX_PAGES,
  fetchClientAcquisitionSample,
} from '../src/app/lib/clientAcquisitionSample.ts';

describe('fetchClientAcquisitionSample', () => {
  beforeEach(() => {
    vi.mocked(listClientsPageRequest).mockReset();
  });

  it('usa meta.total y no pagina más del máximo', async () => {
    const page = Array.from({ length: 500 }, (_, i) => ({
      id: `c-${i}`,
      createdAt: '2026-07-20T10:00:00.000Z',
    }));
    vi.mocked(listClientsPageRequest).mockImplementation(async (_uid, opts) => ({
      clients: page,
      meta: { total: 6489, skip: opts.skip || 0, limit: 500, hasMore: true },
    }));

    const { totalClients, sample } = await fetchClientAcquisitionSample('pau', {
      monthKey: '2026-07',
      businessId: 'biz-delivery',
    });

    expect(totalClients).toBe(6489);
    expect(sample.length).toBe(CLIENT_ACQUISITION_SAMPLE_MAX_PAGES * 500);
    expect(listClientsPageRequest).toHaveBeenCalledTimes(CLIENT_ACQUISITION_SAMPLE_MAX_PAGES);
  });

  it('para si la página queda vacía (empresa events sin clientes)', async () => {
    vi.mocked(listClientsPageRequest).mockResolvedValue({
      clients: [],
      meta: { total: 0, skip: 0, limit: 500, hasMore: false },
    });

    const { totalClients, sample } = await fetchClientAcquisitionSample('pau', {
      monthKey: '2026-07',
      businessId: 'biz-events',
    });

    expect(totalClients).toBe(0);
    expect(sample).toEqual([]);
    expect(listClientsPageRequest).toHaveBeenCalledTimes(1);
  });
});
