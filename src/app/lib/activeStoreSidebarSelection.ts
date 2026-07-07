import type { DeliverySidebarStoreRow } from './deliveryApi';

/**
 * Una sola fila activa en el sidebar de tiendas (ops/delivery).
 * Prioriza PDV activo; si no hay PDV, usa centro `wc:` sin PDV enlazado.
 */
export function resolveActiveOpsStoreRowId(
  rows: DeliverySidebarStoreRow[],
  activeSalesPointId: string | null | undefined,
  activePreferenceRaw: string | null | undefined,
): string | null {
  if (rows.length === 0) return null;

  const activePdvId = String(activeSalesPointId || '').trim();
  if (activePdvId) {
    const byPdv = rows.find((r) => r.pdvId === activePdvId);
    if (byPdv) return byPdv.rowId;
  }

  const raw = String(activePreferenceRaw || '').trim();
  if (raw.startsWith('wc:')) {
    const wcId = raw.slice(3).trim();
    if (wcId) {
      const byWc = rows.find((r) => r.workCenterId === wcId && !r.pdvId);
      if (byWc) return byWc.rowId;
    }
  }

  if (activePdvId) {
    const fallback = rows.find((r) => r.rowId === activePdvId);
    if (fallback) return fallback.rowId;
  }

  return null;
}

/** Sidebar compraventa / legacy: solo un centro de trabajo activo. */
export function resolveActiveWorkCenterRowId(
  workCenterIds: string[],
  selectedWorkCenterId: string | null | undefined,
): string | null {
  const selected = String(selectedWorkCenterId || '').trim();
  if (!selected) return null;
  return workCenterIds.includes(selected) ? selected : null;
}
