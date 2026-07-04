import { normalizeBusinessScopeId } from './deliverySetup';

/** Query param que fija la empresa activa en el historial del navegador (atrás/adelante). */
export const BUSINESS_SCOPE_QUERY = 'empresa';

export function readBusinessIdFromSearch(search: string): string | null {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (!raw.trim()) return null;
  const id = normalizeBusinessScopeId(new URLSearchParams(raw).get(BUSINESS_SCOPE_QUERY));
  return id || null;
}

export function withBusinessScopeSearch(search: string, businessId: string | null | undefined): string {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const id = normalizeBusinessScopeId(businessId);
  if (id) {
    params.set(BUSINESS_SCOPE_QUERY, id);
  } else {
    params.delete(BUSINESS_SCOPE_QUERY);
  }
  const next = params.toString();
  return next ? `?${next}` : '';
}

/** Añade o sustituye `?empresa=` en una ruta interna (/saas/...). */
export function saasPathWithBusinessScope(
  path: string,
  businessId: string | null | undefined,
): string {
  const trimmed = String(path || '').trim();
  if (!trimmed) return trimmed;
  const hashIndex = trimmed.indexOf('#');
  const withoutHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  const hash = hashIndex >= 0 ? trimmed.slice(hashIndex) : '';
  const qIndex = withoutHash.indexOf('?');
  const pathname = qIndex >= 0 ? withoutHash.slice(0, qIndex) : withoutHash;
  const search = qIndex >= 0 ? withoutHash.slice(qIndex) : '';
  return `${pathname}${withBusinessScopeSearch(search, businessId)}${hash}`;
}

export function shouldSyncBusinessScopeInUrl(pathname: string): boolean {
  return pathname === '/saas' || pathname.startsWith('/saas/');
}
