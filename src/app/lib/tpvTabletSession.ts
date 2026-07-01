import type { PointOfSale } from './deliveryApi';

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

/** Rutas del TPV operativo tras activar tablet (código de tienda). */
export function isTpvTabletWorkerPath(pathname: string): boolean {
  const path = String(pathname || '').trim();
  return path === TPV_TABLET_DELIVERY_PATH || path.startsWith('/saas/worker/tpv');
}

/** Sesión tablet con binding válido en ruta TPV — no forzar selector de empresas. */
export function isTpvTabletSaasSession(pathname: string): boolean {
  return isTpvTabletBound() && isTpvTabletWorkerPath(pathname);
}

/** Destino del TPV según el binding tablet (independiente del vertical de la empresa). */
export function resolveTpvTabletWorkerPath(): string {
  const binding = readTpvTabletBinding();
  if (!binding) return TPV_TABLET_DELIVERY_PATH;
  if (binding.tpvVertical === TPV_TABLET_VERTICAL_DELIVERY) return TPV_TABLET_DELIVERY_PATH;
  return TPV_TABLET_DELIVERY_PATH;
}

/** PDV mínimo desde el binding tablet (cuando el fetch de tiendas aún no devolvió el local). */
export function buildTabletBindingPdvStub(binding: TpvTabletBinding): PointOfSale {
  const pdvId = String(binding.pdvId).trim();
  const wcId = String(binding.workCenterId || '').trim() || `wc-tablet-${pdvId}`;
  const now = new Date().toISOString();
  return {
    _id: pdvId,
    id: pdvId,
    type: 'point_of_sale',
    user_id: binding.dataUserId,
    workCenterId: wcId,
    name: binding.pdvName || binding.businessName || 'Tienda',
    code: binding.terminalCode,
    terminalCode: binding.terminalCode,
    address: '',
    terminals: [
      {
        id: `tablet-${pdvId}`,
        name: 'Tablet',
        code: 'TABLET',
        active: true,
      },
    ],
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function mergeTabletBindingPdv(
  pointsOfSale: PointOfSale[],
  binding: TpvTabletBinding | null | undefined,
): PointOfSale[] {
  if (!binding?.pdvId) return pointsOfSale;
  const pick = String(binding.pdvId).trim();
  if (pointsOfSale.some((p) => p._id === pick)) return pointsOfSale;
  return [...pointsOfSale, buildTabletBindingPdvStub(binding)];
}
