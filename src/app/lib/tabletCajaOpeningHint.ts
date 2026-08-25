import {
  fetchTpvStoreOpeningHintRequest,
  type TpvRegisterSession,
} from './deliveryApi';
import { resolvePreviousCloseCashAmount } from './tpvCajaScope';
import {
  readTabletCajaOpeningHint,
  writeTabletCajaOpeningHint,
  type TabletCajaOpeningHint,
} from './tpvTabletSession';

/** Caché local del fondo / sesiones antes de volver a pedir opening-hint. */
export const TABLET_CAJA_HINT_TTL_MS = 45_000;

export function resolveOpeningHintSuggestedFondo(hint: {
  lastClosed?: TpvRegisterSession | null;
  suggestedFondo?: number | null;
}): number | null {
  const fondoFromClose = resolvePreviousCloseCashAmount(hint.lastClosed ?? null);
  if (fondoFromClose != null) return fondoFromClose;
  if (hint.suggestedFondo != null && Number.isFinite(hint.suggestedFondo)) {
    return hint.suggestedFondo;
  }
  return null;
}

export function isTabletCajaHintFresh(
  cached: TabletCajaOpeningHint | null,
  maxAgeMs = TABLET_CAJA_HINT_TTL_MS,
): boolean {
  const fetchedMs = cached?.fetchedAt ? new Date(cached.fetchedAt).getTime() : 0;
  return fetchedMs > 0 && Date.now() - fetchedMs < maxAgeMs;
}

export async function fetchAndCacheTabletCajaOpeningHint(params: {
  dataUserId: string;
  pdvId: string;
  workCenterId?: string;
  businessId?: string;
}): Promise<TabletCajaOpeningHint | null> {
  const ownerId = String(params.dataUserId || '').trim();
  const pdvId = String(params.pdvId || '').trim();
  if (!ownerId || !pdvId) return null;

  try {
    const hint = await fetchTpvStoreOpeningHintRequest(ownerId, {
      pointOfSaleId: pdvId,
      workCenterId: params.workCenterId,
      businessId: params.businessId,
    });
    const cached: TabletCajaOpeningHint = {
      pdvId,
      businessId: params.businessId,
      openSession: hint.openSession,
      lastClosed: hint.lastClosed,
      suggestedFondo: resolveOpeningHintSuggestedFondo(hint),
      fetchedAt: new Date().toISOString(),
    };
    writeTabletCajaOpeningHint(cached);
    return cached;
  } catch {
    return readTabletCajaOpeningHint(pdvId);
  }
}

/** Prefetch no bloqueante: login tablet y gate comparten la misma caché local. */
export function prefetchTabletCajaOpeningHint(params: {
  dataUserId: string;
  pdvId: string;
  workCenterId?: string;
  businessId?: string;
}): void {
  const pdvId = String(params.pdvId || '').trim();
  if (!pdvId) return;
  if (isTabletCajaHintFresh(readTabletCajaOpeningHint(pdvId))) return;
  void fetchAndCacheTabletCajaOpeningHint(params);
}
