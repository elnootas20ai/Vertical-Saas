import type { PointOfSale } from './deliveryApi';
import { isRestaurantBusinessType } from './deliveryOpsTypes';

/** Vertical fijado por el código tablet TPV según el negocio vinculado. */
export type TpvTabletVertical = 'delivery' | 'restaurant';

export const TPV_TABLET_VERTICAL_DELIVERY: TpvTabletVertical = 'delivery';
export const TPV_TABLET_VERTICAL_RESTAURANT: TpvTabletVertical = 'restaurant';

/** Ruta canónica del TPV operativo tras activar tablet con código de tienda (delivery). */
export const TPV_TABLET_DELIVERY_PATH = '/saas/worker/tpv/delivery';

/** Ruta canónica del TPV operativo tablet en bar/restaurante. */
export const TPV_TABLET_RESTAURANT_PATH = '/saas/worker/tpv/restaurant';

export interface TpvTabletBinding {
  terminalCode: string;
  pdvId: string;
  workCenterId: string;
  businessId: string;
  dataUserId: string;
  /** Terminal TPV de sala (login con código SALA-*). */
  salaTerminalId?: string;
  /** Vertical del TPV; lo fija el backend al validar el código (no el businessType). */
  tpvVertical: TpvTabletVertical;
  pdvName?: string;
  businessName?: string;
  boundAt: string;
}

const STORAGE_KEY = 'vertial_tpv_tablet_binding';

function normalizeBusinessScopeId(value?: string | null): string {
  return String(value || '').replace(/^business:/, '').trim();
}

/** Migración: bindings antiguos sin tpvVertical (inferir restaurante si aplica). */
function inferLegacyTpvVertical(binding: TpvTabletBinding): TpvTabletVertical {
  if (binding.salaTerminalId) return TPV_TABLET_VERTICAL_RESTAURANT;

  const code = String(binding.terminalCode || '').trim().toUpperCase();
  if (code.startsWith('SALA-')) return TPV_TABLET_VERTICAL_RESTAURANT;

  if (binding.tpvVertical === TPV_TABLET_VERTICAL_RESTAURANT) return TPV_TABLET_VERTICAL_RESTAURANT;
  if (binding.tpvVertical === TPV_TABLET_VERTICAL_DELIVERY) return TPV_TABLET_VERTICAL_DELIVERY;

  const businessId = normalizeBusinessScopeId(binding.businessId);
  if (businessId && typeof window !== 'undefined') {
    try {
      const storages = [sessionStorage, localStorage];
      for (const storage of storages) {
        for (let i = 0; i < storage.length; i += 1) {
          const key = storage.key(i);
          if (!key?.startsWith('vertial_businesses_cache')) continue;
          const raw = storage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw) as unknown;
          const list = Array.isArray(parsed) ? parsed : [];
          const match = list.find(
            (b: { business_id?: string; id?: string; businessType?: string }) =>
              normalizeBusinessScopeId(b.business_id || b.id) === businessId,
          );
          if (isRestaurantBusinessType(match?.businessType)) {
            return TPV_TABLET_VERTICAL_RESTAURANT;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return TPV_TABLET_VERTICAL_DELIVERY;
}

function normalizeBinding(parsed: TpvTabletBinding): TpvTabletBinding {
  const tpvVertical = inferLegacyTpvVertical(parsed);
  const normalized = { ...parsed, tpvVertical };
  if (parsed.tpvVertical !== tpvVertical) {
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
      tpvVertical: binding.tpvVertical
        || inferLegacyTpvVertical({
          ...binding,
          terminalCode: String(binding.terminalCode || '').trim().toUpperCase(),
          tpvVertical: TPV_TABLET_VERTICAL_DELIVERY,
          boundAt: binding.boundAt || new Date().toISOString(),
        }),
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
  return (
    path === TPV_TABLET_DELIVERY_PATH
    || path === TPV_TABLET_RESTAURANT_PATH
    || path.startsWith('/saas/worker/tpv')
  );
}

/** Sesión tablet con binding válido en ruta TPV — no forzar selector de empresas. */
export function isTpvTabletSaasSession(pathname: string): boolean {
  return isTpvTabletBound() && isTpvTabletWorkerPath(pathname);
}

/** Destino del TPV tablet — solo Delivery (bar/restaurante retirado del producto). */
export function resolveTpvTabletWorkerPath(): string {
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
