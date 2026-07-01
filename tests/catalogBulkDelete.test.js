// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/app/lib/deliveryApi.ts', () => ({
  bulkDeleteCatalogItemsRequest: vi.fn(),
}));

import { bulkDeleteCatalogItemsRequest } from '../src/app/lib/deliveryApi.ts';
import { deleteCatalogItemsRelentlessly } from '../src/app/lib/catalogBulkDelete.ts';

describe('deleteCatalogItemsRelentlessly', () => {
  beforeEach(() => {
    vi.mocked(bulkDeleteCatalogItemsRequest).mockReset();
  });

  it('reintenta ids fallidos hasta vaciar la lista', async () => {
    vi.mocked(bulkDeleteCatalogItemsRequest)
      .mockResolvedValueOnce({
        ok: false,
        deleted: 8,
        failed: 2,
        errorDetails: [
          { itemId: 'a', error: 'timeout' },
          { itemId: 'b', error: 'timeout' },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        deleted: 2,
        failed: 0,
      });

    const result = await deleteCatalogItemsRelentlessly('user-1', ['a', 'b', 'c'], {
      maxRounds: 3,
    });

    expect(result.failed).toBe(0);
    expect(result.deleted).toBe(10);
    expect(bulkDeleteCatalogItemsRequest).toHaveBeenCalledTimes(2);
  });
});
