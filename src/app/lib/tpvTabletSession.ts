import type { PointOfSale } from './deliveryApi';
import {
  isRestaurantBusinessType,
  isStrictDeliveryBusinessType,
} from './deliveryOpsTypes';
import { AUTH_PATHS } from './authEntryPaths';
import { clearAuthTokens, logoutRequest } from './authApi';
import { clearVertialClientCaches, SESSION_USER_STORAGE_KEY } from './clientSessionStorage';

/** Vertical fijado por el código tablet TPV según el negocio vinculado. */
export type TpvTabletVertical = 'delivery' | 'restaurant';

export const TPV_TABLET_VERTICAL_DELIVERY: TpvTabletVertical = 'delivery';
export const TPV_TABLET_VERTICAL_RESTAURANT: TpvTabletVertical = 'restaurant';

/** Ruta canónica del TPV operativo tras activar tablet con código de tienda (delivery). */
export const TPV_TABLET_DELIVERY_PATH = '/saas/worker/tpv/delivery';

/** Ruta canónica del TPV operativo tablet en bar/restaurante. */
export const TPV_TABLET_RESTAURANT_PATH = '/saas/worker/tpv/restaurant';

/** Código de tienda al salir del TPV (para volver a activar tras login trabajador). */
const TPV_TABLET_RETURN_CODE_KEY = 'vertial_tpv_tablet_return_code';

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
const CAJA_HINT_KEY = 'vertial_tpv_tablet_caja_hint';
const DEVICE_ID_KEY = 'vertial_tpv_device_id';

export type TabletCajaOpeningHint = {
  pdvId: string;
  businessId?: string;
  openSession?: import('./deliveryApi').TpvRegisterSession | null;
  lastClosed?: import('./deliveryApi').TpvRegisterSession | null;
  suggestedFondo?: number | null;
  fetchedAt: string;
};

export function writeTabletCajaOpeningHint(hint: TabletCajaOpeningHint): void {
  try {
    localStorage.setItem(CAJA_HINT_KEY, JSON.stringify(hint));
  } catch {
    // ignore
  }
}

export function readTabletCajaOpeningHint(pdvId?: string): TabletCajaOpeningHint | null {
  try {
    const raw = localStorage.getItem(CAJA_HINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TabletCajaOpeningHint;
    const pick = String(pdvId || '').trim();
    if (pick && String(parsed?.pdvId || '').trim() !== pick) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Sesiones de caja cacheadas en tablet (carga instantánea al abrir TPV). */
export function seedTabletSessionsFromCache(
  pdvId?: string | null,
): import('./deliveryApi').TpvRegisterSession[] {
  const pick = String(pdvId || readTpvTabletBinding()?.pdvId || '').trim();
  if (!pick) return [];
  const cached = readTabletCajaOpeningHint(pick);
  if (!cached) return [];
  return [cached.openSession, cached.lastClosed].filter(
    (s): s is import('./deliveryApi').TpvRegisterSession => Boolean(s?._id),
  );
}

export function clearTabletCajaOpeningHint(): void {
  try {
    localStorage.removeItem(CAJA_HINT_KEY);
  } catch {
    // ignore
  }
}

/** Id estable del navegador/tablet para vincular al código de tienda. */
export function getOrCreateTpvDeviceId(): string {
  try {
    const existing = String(localStorage.getItem(DEVICE_ID_KEY) || '').trim();
    if (existing.length >= 8) return existing;
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `dev-fallback-${Date.now().toString(36)}`;
  }
}

function normalizeBusinessScopeId(value?: string | null): string {
  return String(value || '').replace(/^business:/, '').trim();
}

function lookupCachedBusinessType(businessId: string): string | null {
  if (!businessId || typeof window === 'undefined') return null;
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
        const type = String(match?.businessType || '').trim();
        if (type) return type;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Migración / anti-stale: un binding viejo no puede abrir mesas de bar
 * si la empresa del código es delivery.
 */
function inferLegacyTpvVertical(binding: TpvTabletBinding): TpvTabletVertical {
  const businessId = normalizeBusinessScopeId(binding.businessId);
  const cachedType = businessId ? lookupCachedBusinessType(businessId) : null;

  // Empresa delivery → siempre TPV delivery (ignora binding restaurant viejo).
  if (isStrictDeliveryBusinessType(cachedType)) {
    return TPV_TABLET_VERTICAL_DELIVERY;
  }
  if (isRestaurantBusinessType(cachedType)) {
    return TPV_TABLET_VERTICAL_RESTAURANT;
  }

  if (binding.salaTerminalId) return TPV_TABLET_VERTICAL_RESTAURANT;

  const code = String(binding.terminalCode || '').trim().toUpperCase();
  if (code.startsWith('SALA-')) return TPV_TABLET_VERTICAL_RESTAURANT;

  if (binding.tpvVertical === TPV_TABLET_VERTICAL_RESTAURANT) return TPV_TABLET_VERTICAL_RESTAURANT;
  if (binding.tpvVertical === TPV_TABLET_VERTICAL_DELIVERY) return TPV_TABLET_VERTICAL_DELIVERY;

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
    try {
      window.dispatchEvent(new CustomEvent('vertial:store-tablet-session', { detail: { active: true } }));
    } catch {
      /* ignore */
    }
  } catch {
    // ignore
  }
}

export function clearTpvTabletBinding(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    try {
      window.dispatchEvent(new CustomEvent('vertial:store-tablet-session', { detail: { active: false } }));
    } catch {
      /* ignore */
    }
  } catch {
    // ignore
  }
}

/** Pantalla pública de código de tienda (fuera del SaaS). */
export const TPV_TABLET_LOGIN_PATH = AUTH_PATHS.tpvTabletLogin;

/** Destino al salir del TPV tablet: login trabajador (no login empresa). */
export const TPV_TABLET_EXIT_PATH = AUTH_PATHS.workerLogin;

export function peekTpvTabletReturnCode(): string {
  try {
    return String(sessionStorage.getItem(TPV_TABLET_RETURN_CODE_KEY) || '').trim().toUpperCase();
  } catch {
    return '';
  }
}

export function clearTpvTabletReturnCode(): void {
  try {
    sessionStorage.removeItem(TPV_TABLET_RETURN_CODE_KEY);
  } catch {
    // ignore
  }
}

function rememberTpvTabletReturnCode(code: string): void {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return;
  try {
    sessionStorage.setItem(TPV_TABLET_RETURN_CODE_KEY, normalized);
  } catch {
    // ignore
  }
}

/** Desvincula la tablet y devuelve la ruta de login por código. */
export function exitTpvTabletSessionPath(): string {
  clearTpvTabletBinding();
  return TPV_TABLET_LOGIN_PATH;
}

export type LeaveTpvTabletSessionOptions = {
  /** @deprecated No usar: con código TPV no se vuelve a la cuenta CEO. */
  keepAuthAndGoTo?: string;
  /**
   * Navigate de React Router (recomendado).
   * Evita `location.replace` → `#root` vacío → pantalla en blanco.
   */
  navigate?: (to: string, opts?: { replace?: boolean }) => void | Promise<unknown>;
};

/**
 * Salir del TPV tablet (modo código de tienda):
 * 1) SPA → pantalla de código (sin remount / blanco)
 * 2) luego limpia vínculo + sesión
 *
 * Importante: no borrar el binding ANTES de navegar. Si no,
 * RequireTpvTabletEntry pinta `null` (pantalla en blanco) un instante.
 */
export async function leaveTpvTabletSession(
  logout: () => Promise<void>,
  opts?: LeaveTpvTabletSessionOptions,
): Promise<void> {
  const binding = readTpvTabletBinding();
  const code = String(binding?.terminalCode || '').trim().toUpperCase();
  void opts?.keepAuthAndGoTo;

  const dest = code
    ? `${TPV_TABLET_LOGIN_PATH}?code=${encodeURIComponent(code)}`
    : TPV_TABLET_LOGIN_PATH;

  if (code) rememberTpvTabletReturnCode(code);

  if (typeof window === 'undefined') {
    clearTpvTabletBinding();
    try {
      await logout();
    } catch {
      // ignore
    }
    return;
  }

  const paintCodePlaceholder = () => {
    if (typeof document === 'undefined') return;
    const root = document.getElementById('root');
    if (!root) return;
    root.innerHTML = `
      <div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;background:#f8fafc">
        <p style="margin:0;font-size:15px;font-weight:600;color:#475569">Código de tienda…</p>
      </div>
    `;
  };

  const clearSessionQuietly = async () => {
    clearTpvTabletBinding();
    try {
      clearVertialClientCaches();
      try {
        localStorage.removeItem(SESSION_USER_STORAGE_KEY);
      } catch {
        // ignore
      }
      clearAuthTokens();
      void logoutRequest().catch(() => {});
    } catch {
      // ignore
    }
    // clearVertialClientCaches puede borrar sessionStorage: reponer código.
    if (code) rememberTpvTabletReturnCode(code);
    try {
      await logout();
    } catch {
      // ignore
    }
  };

  // 1) Navegar a la pantalla de código SIN recargar y SIN borrar binding aún.
  const waitUntilOnCodeScreen = () =>
    new Promise<void>((resolve) => {
      const started = Date.now();
      const tick = () => {
        const path = String(window.location.pathname || '');
        if (path.startsWith(TPV_TABLET_LOGIN_PATH) || Date.now() - started > 2500) {
          resolve();
          return;
        }
        window.requestAnimationFrame(tick);
      };
      window.requestAnimationFrame(tick);
    });

  let spaOk = false;
  try {
    if (opts?.navigate) {
      await Promise.resolve(opts.navigate(dest, { replace: true }));
      await waitUntilOnCodeScreen();
      spaOk = String(window.location.pathname || '').startsWith(TPV_TABLET_LOGIN_PATH);
    } else {
      const { router } = await import('../routes');
      await router.navigate(dest, { replace: true });
      await waitUntilOnCodeScreen();
      spaOk = String(window.location.pathname || '').startsWith(TPV_TABLET_LOGIN_PATH);
    }
  } catch {
    spaOk = false;
  }

  if (!spaOk) {
    paintCodePlaceholder();
    await clearSessionQuietly();
    window.location.replace(dest);
    return;
  }

  // 2) Ya en /auth/tpv-tablet: quitar vínculo y cerrar sesión.
  await clearSessionQuietly();
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
  if (!pdvId || !businessId) return false;

  const selfId = String(params.authUser?.user_id || params.authUser?.id || '').trim();
  if (!selfId) return false;

  const boundAuth = String(binding.authUserId || '').trim();
  if (boundAuth && boundAuth !== selfId) return false;

  // Quien activó el código en este dispositivo: solo OK si la empresa del binding
  // está en SU lista (evita arrastrar PDV de otro negocio al cambiar de cuenta).
  if (boundAuth === selfId) {
    if (params.businessesSettled) {
      const list = Array.isArray(params.businesses) ? params.businesses : [];
      return list.some(
        (b) => normalizeBusinessScopeId(b.business_id || b.id) === businessId,
      );
    }
    return true;
  }

  const dataUserId = String(binding.dataUserId || '').trim();
  if (!dataUserId) return false;

  const list = Array.isArray(params.businesses) ? params.businesses : [];
  if (list.length === 0) {
    // Bindings viejos sin authUserId → no confiar (bloquea salto a Pau).
    return false;
  }

  const match = list.find(
    (b) => normalizeBusinessScopeId(b.business_id || b.id) === businessId,
  );
  if (!match) return false;

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
  const wcId = String(binding.workCenterId || '').trim();
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
  const bindingWc = String(binding.workCenterId || '').trim();
  const idx = pointsOfSale.findIndex((p) => p._id === pick);
  if (idx >= 0) {
    const existing = pointsOfSale[idx];
    const existingWc = String(existing.workCenterId || '').trim();
    if (bindingWc && bindingWc !== existingWc) {
      const next = [...pointsOfSale];
      next[idx] = { ...existing, workCenterId: bindingWc };
      return next;
    }
    return pointsOfSale;
  }
  return [...pointsOfSale, buildTabletBindingPdvStub(binding)];
}
