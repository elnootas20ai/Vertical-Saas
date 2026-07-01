import { bulkDeleteCatalogItemsRequest } from './deliveryApi';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type CatalogBulkDeleteProgress = {
  round: number;
  pending: number;
  deleted: number;
};

/** Borra todos los ids dados, reintentando hasta agotar fallos transitorios. */
export async function deleteCatalogItemsRelentlessly(
  userId: string,
  itemIds: string[],
  options?: {
    maxRounds?: number;
    onProgress?: (progress: CatalogBulkDeleteProgress) => void;
  },
): Promise<{ deleted: number; failed: number; remainingIds: string[] }> {
  const maxRounds = Math.max(1, options?.maxRounds ?? 6);
  let pending = [...new Set(itemIds.map((id) => String(id || '').trim()).filter(Boolean))];
  let deletedTotal = 0;

  for (let round = 0; round < maxRounds && pending.length > 0; round += 1) {
    options?.onProgress?.({ round: round + 1, pending: pending.length, deleted: deletedTotal });

    const result = await bulkDeleteCatalogItemsRequest(userId, pending);
    deletedTotal += Number(result.deleted || 0);

    const failedIds = (result.errorDetails || [])
      .map((entry) => String(entry.itemId || '').trim())
      .filter(Boolean);

    if (result.failed <= 0 || failedIds.length === 0) {
      return { deleted: deletedTotal, failed: 0, remainingIds: [] };
    }

    pending = failedIds;
    if (round < maxRounds - 1) {
      await sleep(350 * (round + 1));
    }
  }

  return { deleted: deletedTotal, failed: pending.length, remainingIds: pending };
}
