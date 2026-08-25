import { mergeTabletBindingPdv, readTpvTabletBinding, seedTabletSessionsFromCache } from './tpvTabletSession';
import type { PointOfSale } from './deliveryApi';
import type { TpvRegisterSession } from './deliveryApi';

/** Estado inicial del gate TPV en tablet con código ya activado (sin spinner). */
export function readTabletRegisterBootstrapState(): {
  binding: ReturnType<typeof readTpvTabletBinding>;
  hasTabletCode: boolean;
  sessions: TpvRegisterSession[];
  pointsOfSale: PointOfSale[];
  loading: boolean;
  openingRecoverHold: boolean;
  openingScreenUnlocked: boolean;
  hasDisplayedStores: boolean;
} {
  const binding = readTpvTabletBinding();
  const hasTabletCode = Boolean(String(binding?.pdvId || '').trim());
  const sessions = seedTabletSessionsFromCache(binding?.pdvId);
  const pointsOfSale = hasTabletCode ? mergeTabletBindingPdv([], binding) : [];

  return {
    binding,
    hasTabletCode,
    sessions,
    pointsOfSale,
    loading: !hasTabletCode,
    openingRecoverHold: !hasTabletCode,
    openingScreenUnlocked: hasTabletCode,
    hasDisplayedStores: hasTabletCode,
  };
}
