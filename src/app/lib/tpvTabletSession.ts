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
  /**
   * Usuario que activó el código de tienda en este dispositivo.
   * Si entra otra cuenta, el binding se invalida (evita saltar a datos de Pau u otra empresa).
   */
  authUserId?: string;
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
    authUserId?: string;
  },
): void {
  try {
    const authUserId = String(binding.authUserId || '').trim();
    const payload: TpvTabletBinding = {
      ...binding,
      terminalCode: String(binding.terminalCode || '').trim().toUpperCase(),
      ...(authUserId ? { authUserId } : {}),
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

/** Pantalla pública de código de tienda (fuera del SaaS). */
export const TPV_TABLET_LOGIN_PATH = '/auth/tpv-tablet';

/** Desvincula la tablet y devuelve la ruta de login por código. */
export function exitTpvTabletSessionPath(): string {
  clearTpvTabletBinding();
  return TPV_TABLET_LOGIN_PATH;
}

/**
 * Salir del TPV tablet (modo código de tienda / trabajador):
 * quita el vínculo, cierra sesión y va a la pantalla de código.
 * Usa location.replace para evitar races de redirect a /saas.
 *
 * Cuenta empresa/admin: solo limpia el binding y vuelve al SaaS (sin logout).
 */
export async function leaveTpvTabletSession(
  logout: () => Promise<void>,
  options?: { keepAuthAndGoTo?: string },
): Promise<void> {
  clearTpvTabletBinding();
  const keepTo = String(options?.keepAuthAndGoTo || '').trim();
  if (keepTo && typeof window !== 'undefined') {
    window.location.replace(keepTo);
    return;
  }
  try {
    await logout();
  } catch {
    // Seguir igual a la pantalla de código.
  }
  if (typeof window !== 'undefined') {
    window.location.replace(TPV_TABLET_LOGIN_PATH);
  }
}

export function isTpvTabletBound(): boolean {
  return readTpvTabletBinding() !== null;
}

/**
 * ¿Este binding tablet pertenece a la cuenta/sesión actual?
 * Evita que un código de Pau (u otra empresa) deje datos en el TPV de otra cuenta.
 */
export function isTpvTabletBindingAllowedForAuth(params: {
  binding?: Pick<TpvTabletBinding, 'pdvId' | 'businessId' | 'dataUserId' | 'authUserId'> | null;
  authUser?: { user_id?: string; id?: string } | null;
  businesses?: Array<{
    business_id?: string;
    id?: string;
    owner_user_id?: string;
    members?: Array<{ user_id?: string }>;
  }> | null;
  /** true cuando ya cargó la lista de empresas (aunque esté vacía). */
  businessesSettled?: boolean;
}): boolean {
  const binding = params.binding;
  if (!binding) return false;
  const pdvId = String(binding.pdvId || '').trim();
  const businessId = normalizeBusinessScopeId(binding.businessId);
  const dataUserId = String(binding.dataUserId || '').trim();
  if (!pdvId || !businessId || !dataUserId) return false;

  const selfId = String(params.authUser?.user_id || params.authUser?.id || '').trim();
  if (!selfId) return false;

  const boundAuth = String(binding.authUserId || '').trim();
  if (boundAuth && boundAuth !== selfId) return false;

  const list = Array.isArray(params.businesses) ? params.businesses : [];
  if (list.length === 0) {
    // Sin empresas: solo confiar si este mismo usuario activó el código.
    // Bindings viejos sin authUserId → no confiar (bloquea salto a Pau).
    return boundAuth === selfId;
  }

  const match = list.find(
    (b) => normalizeBusinessScopeId(b.business_id || b.id) === businessId,
  );
  if (!match) return false;

  // Quien activó el código en este dispositivo: OK aunque el API de empresas
  // no traiga `members` (trabajadores / payloads reducidos). Sin esto el TPV
  // echaba al login tras entrar con el código.
  if (boundAuth === selfId) return true;

  const ownerId = String(match.owner_user_id || '').trim();
  if (dataUserId !== selfId && dataUserId !== ownerId) return false;

  if (ownerId === selfId || dataUserId === selfId) return true;
  return (match.members || []).some((m) => String(m.user_id || '').trim() === selfId);
}

/**
 * Si el binding es de otra cuenta/empresa, lo borra.
 * Devuelve el binding válido o null.
 */
export function sanitizeTpvTabletBindingForAuth(params: {
  authUser?: { user_id?: string; id?: string } | null;
  businesses?: Array<{
    business_id?: string;
    id?: string;
    owner_user_id?: string;
    members?: Array<{ user_id?: string }>;
  }> | null;
  businessesSettled?: boolean;
}): TpvTabletBinding | null {
  const binding = readTpvTabletBinding();
  if (!binding) return null;
  const ok = isTpvTabletBindingAllowedForAuth({
    binding,
    authUser: params.authUser,
    businesses: params.businesses,
    businessesSettled: params.businessesSettled,
  });
  if (ok) return binding;
  clearTpvTabletBinding();
  return null;
}

/** Sesión con código de tienda activo (da igual la ruta). */
export function isTpvTabletTerminalBound(): boolean {
  return isTpvTabletBound();
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

/**
 * Con código TPV activo solo se permite el TPV de tienda (y fichaje).
 * Nunca dashboard personal, Gate, CRM, etc.
 */
export function isTpvTabletAllowedPath(pathname: string): boolean {
  const path = String(pathname || '').trim();
  if (!path) return false;
  if (isTpvTabletWorkerPath(path)) return true;
  if (path.startsWith('/auth/tpv-tablet')) return true;
  // Fichaje previo al tablero TPV
  if (path === '/saas/worker/clock' || path.startsWith('/saas/worker/clock/')) return true;
  return false;
}

/** Sesión tablet con binding válido en ruta TPV — no forzar selector de empresas. */
export function isTpvTabletSaasSession(pathname: string): boolean {
  return isTpvTabletBound() && isTpvTabletWorkerPath(pathname);
}

/** Destino del TPV tablet según el binding (delivery o restaurant). */
export function resolveTpvTabletWorkerPath(): string {
  const binding = readTpvTabletBinding();
  if (binding?.tpvVertical === TPV_TABLET_VERTICAL_RESTAURANT) {
    return TPV_TABLET_RESTAURANT_PATH;
  }
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
