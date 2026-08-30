import type { DeliverySidebarStoreRow } from './deliveryApi';

/**
 * Una sola fila activa en el sidebar de tiendas (ops/delivery).
 * Prioriza PDV activo; si aún no resolvió, usa la preferencia cruda (evita volver a la 1ª).
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
    const byRow = rows.find((r) => r.rowId === activePdvId);
    if (byRow) return byRow.rowId;
  }

  const raw = String(activePreferenceRaw || '').trim();
  if (raw.startsWith('wc:')) {
    const wcId = raw.slice(3).trim();
    if (wcId) {
      const byWcOnly = rows.find((r) => r.workCenterId === wcId && !r.pdvId);
      if (byWcOnly) return byWcOnly.rowId;
      const byWc = rows.find((r) => r.workCenterId === wcId);
      if (byWc) return byWc.rowId;
    }
  } else if (raw) {
    // Preferencia guardada aunque activeSalesPointId aún sea null (refresh / lista a medias).
    const byPref = rows.find((r) => r.pdvId === raw || r.rowId === raw);
    if (byPref) return byPref.rowId;
  }

  // Solo caer a la primera si no hay preferencia ni PDV activo.
  if (!raw && !activePdvId) {
    const firstActive = rows.find((r) => !r.inactive);
    return (firstActive ?? rows[0])?.rowId ?? null;
  }

  return null;
}

/** Sidebar compraventa / legacy: solo un centro de trabajo activo. */
export function resolveActiveWorkCenterRowId(
  workCenterIds: string[],
  selectedWorkCenterId: string | null | undefined,
): string | null {
  const selected = String(selectedWorkCenterId || '').trim();
  if (selected && workCenterIds.includes(selected)) return selected;
  return workCenterIds[0] ?? null;
}
