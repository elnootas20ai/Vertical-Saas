/** Vertical fijado por el código tablet TPV (hoy solo delivery). */
export type TpvTabletVertical = 'delivery';

export const TPV_TABLET_VERTICAL_DELIVERY: TpvTabletVertical = 'delivery';

/** Ruta canónica del TPV operativo tras activar tablet con código de tienda. */
export const TPV_TABLET_DELIVERY_PATH = '/saas/worker/tpv/delivery';

export interface TpvTabletBinding {
  terminalCode: string;
  pdvId: string;
  workCenterId: string;
  businessId: string;
  dataUserId: string;
  /** Vertical del TPV; lo fija el backend al validar el código (no el businessType). */
  tpvVertical: TpvTabletVertical;
  pdvName?: string;
  businessName?: string;
  boundAt: string;
}

const STORAGE_KEY = 'vertial_tpv_tablet_binding';

function normalizeBinding(parsed: TpvTabletBinding): TpvTabletBinding {
  const tpvVertical = parsed.tpvVertical || TPV_TABLET_VERTICAL_DELIVERY;
  const normalized = { ...parsed, tpvVertical };
  if (!parsed.tpvVertical) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // ignore
    }
  }
  return normalized;
}

export function readTpvTabletBinding(): TpvTabletBinding | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TpvTabletBinding;
    if (!parsed?.terminalCode || !parsed?.pdvId || !parsed?.businessId) return null;
    return normalizeBinding(parsed);
  } catch {
    return null;
  }
}

export function writeTpvTabletBinding(
  binding: Omit<TpvTabletBinding, 'boundAt' | 'tpvVertical'> & {
    boundAt?: string;
    tpvVertical?: TpvTabletVertical;
  },
): void {
  try {
    const payload: TpvTabletBinding = {
      ...binding,
      terminalCode: String(binding.terminalCode || '').trim().toUpperCase(),
      tpvVertical: binding.tpvVertical || TPV_TABLET_VERTICAL_DELIVERY,
      boundAt: binding.boundAt || new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function clearTpvTabletBinding(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Desvincula la tablet y devuelve la ruta de login por código. */
export function exitTpvTabletSessionPath(): string {
  clearTpvTabletBinding();
  return '/auth/tpv-tablet';
}

export function isTpvTabletBound(): boolean {
  return readTpvTabletBinding() !== null;
}

/** Destino del TPV según el binding tablet (independiente del vertical de la empresa). */
export function resolveTpvTabletWorkerPath(): string {
  const binding = readTpvTabletBinding();
  if (!binding) return TPV_TABLET_DELIVERY_PATH;
  if (binding.tpvVertical === TPV_TABLET_VERTICAL_DELIVERY) return TPV_TABLET_DELIVERY_PATH;
  return TPV_TABLET_DELIVERY_PATH;
}
