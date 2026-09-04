import { useState, useEffect, useRef, useCallback } from 'react';
import { searchClientsByPhoneRequest, CRM_CLIENTS_SYNC_EVENT } from '../lib/crmApi';
import type { Client } from '../context/AppContext';

export interface ClientPhoneSearchResult {
  results: Client[];
  isSearching: boolean;
  /**
   * Query para la que ya terminó una petición (éxito o vacío).
   * Evita el mensaje «No se encontró» mientras el debounce aún no ha buscado.
   */
  settledQuery: string;
  searchError: string | null;
  selectedClient: Client | null;
  selectClient: (client: Client) => void;
  clearSelection: () => void;
  clearResults: () => void;
}

/** Cache corta en el navegador (tras alta TPV se limpia a mano). */
const CLIENT_SEARCH_CACHE_TTL_MS = 45_000;
const CLIENT_SEARCH_CACHE_MAX = 40;
const clientSearchResultCache = new Map<string, { at: number; clients: Client[] }>();

/** Evita tormenta de refresh=1 si la cartera tarda en cargar (una vez / 20s / titular). */
const portfolioRefreshAtByUser = new Map<string, number>();
const PORTFOLIO_REFRESH_COOLDOWN_MS = 20_000;

/** Solo una ficha CRM real pausa la búsqueda. Los ids `tpv-*` no existen en este hook. */
export function clientSelectionBlocksPhoneSearch(client: Client | null | undefined): boolean {
  if (!client) return false;
  if (String(client.id || '').startsWith('tpv-')) return false;
  return true;
}

function isSyntheticTpvClientId(clientId: string | undefined): boolean {
  return String(clientId || '').startsWith('tpv-');
}

function cacheKey(
  userId: string,
  businessId: string | undefined,
  query: string,
  limit: number,
  includeLegacy: boolean,
  fallbackAll: boolean,
) {
  return `${userId}|${businessId || ''}|${limit}|${includeLegacy ? 1 : 0}|${fallbackAll ? 1 : 0}|${query}`;
}

function readSearchCache(key: string): Client[] | null {
  const entry = clientSearchResultCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CLIENT_SEARCH_CACHE_TTL_MS) {
    clientSearchResultCache.delete(key);
    return null;
  }
  return entry.clients;
}

function writeSearchCache(key: string, clients: Client[]) {
  clientSearchResultCache.set(key, { at: Date.now(), clients });
  if (clientSearchResultCache.size > CLIENT_SEARCH_CACHE_MAX) {
    const oldest = clientSearchResultCache.keys().next().value;
    if (oldest) clientSearchResultCache.delete(oldest);
  }
}

/** Limpia la caché en memoria del buscador TPV (p. ej. al abrir pedido o tras alta). */
export function clearClientPhoneSearchCache(): void {
  clientSearchResultCache.clear();
}

/** Tras alta/edición CRM: invalidar resultados locales para ver el cliente nuevo. */
if (typeof window !== 'undefined') {
  window.addEventListener(CRM_CLIENTS_SYNC_EVENT, () => {
    clearClientPhoneSearchCache();
  });
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = String((err as { name?: string }).name || '');
  return name === 'AbortError';
}

export function useClientPhoneSearch(params: {
  userId: string;
  phone: string;
  businessId?: string;
  enabled?: boolean;
  debounceMs?: number;
  resultLimit?: number;
  /** Solo dígitos; usado cuando matchByName es false (comportamiento clásico). */
  minDigits?: number;
  /**
   * Si true, envía el texto tal cual al API (nombre o teléfono). Si false, solo dígitos del campo.
   */
  matchByName?: boolean;
  /** Longitud mínima del texto cuando matchByName (por defecto 2). */
  minQueryLength?: number;
  /**
   * TPV: no pausar la búsqueda aunque haya ficha seleccionada.
   */
  keepSearchingWhileSelected?: boolean;
  /**
   * Incluir fichas sin businessId (legacy). Default true (TPV).
   * Verticales con CRM por empresa (p. ej. eventos): false.
   */
  includeLegacy?: boolean;
  /**
   * Si no hay resultados en la empresa, buscar en toda la cuenta. Default true (TPV).
   * Verticales con CRM por empresa: false — sin clientes = lista vacía.
   */
  fallbackAll?: boolean;
}): ClientPhoneSearchResult {
  const {
    userId,
    phone,
    businessId,
    enabled = true,
    debounceMs = 280,
    resultLimit = 15,
    minDigits = 3,
    matchByName = false,
    minQueryLength = 2,
    keepSearchingWhileSelected = false,
    includeLegacy = true,
    fallbackAll = true,
  } = params;
  const [results, setResults] = useState<Client[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [settledQuery, setSettledQuery] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);
  const trimmed = phone.trim();
  const digits = phone.replace(/\D/g, '');
  const queryForApi = matchByName ? trimmed : digits;
  const blocksSearch = keepSearchingWhileSelected
    ? false
    : clientSelectionBlocksPhoneSearch(selectedClient);
  const shouldSearch =
    enabled &&
    !!userId &&
    !blocksSearch &&
    (matchByName ? trimmed.length >= minQueryLength : digits.length >= minDigits);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!shouldSearch) {
      requestSeqRef.current += 1;
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = null;
      setIsSearching(false);
      // Solo limpiar cuando no hay query / no hay userId / bloqueo por selección.
      // Si enabled=false (otro paso), conservar settled/results para no quedar «ciego» al volver.
      if (!trimmed || !userId || blocksSearch) {
        setResults([]);
        setSettledQuery('');
        setSearchError(null);
      }
      return;
    }

    const key = cacheKey(userId, businessId, queryForApi, resultLimit, includeLegacy, fallbackAll);
    const cached = readSearchCache(key);
    if (cached) {
      requestSeqRef.current += 1;
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = null;
      setResults(cached);
      setIsSearching(false);
      setSettledQuery(queryForApi);
      setSearchError(null);
      return;
    }

    // Feedback al instante (tras deploy la 1.ª carga puede ir a ~10s).
    setIsSearching(true);
    setSearchError(null);

    const seq = ++requestSeqRef.current;

    timerRef.current = setTimeout(async () => {
      if (seq !== requestSeqRef.current) return;
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        // search-by-phone: TPV usa includeLegacy + fallbackAll para fichas legacy.
        // Verticales con CRM por empresa pueden desactivarlos (sin clientes = vacío).
        const searchOpts = { includeLegacy, fallbackAll };
        let payload = await searchClientsByPhoneRequest(
          userId,
          queryForApi,
          resultLimit,
          controller.signal,
          businessId,
          searchOpts,
        );

        const lastRefresh = portfolioRefreshAtByUser.get(userId) || 0;
        // Solo refresh si la cartera no cargó (0 / desconocido). Un miss real con cartera OK
        // no debe invalidar ~6k docs ni disparar refresh en cada tipografía.
        const canRefresh =
          payload.clients.length === 0
          && (payload.portfolioSize === 0 || payload.portfolioSize < 0)
          && Date.now() - lastRefresh >= PORTFOLIO_REFRESH_COOLDOWN_MS;
        if (canRefresh && !controller.signal.aborted && seq === requestSeqRef.current) {
          portfolioRefreshAtByUser.set(userId, Date.now());
          payload = await searchClientsByPhoneRequest(
            userId,
            queryForApi,
            resultLimit,
            controller.signal,
            businessId,
            { ...searchOpts, refresh: true },
          );
        }
        if (controller.signal.aborted || seq !== requestSeqRef.current) return;
        const clients = payload.clients;
        if (clients.length > 0) writeSearchCache(key, clients);
        setResults(clients);
        setSettledQuery(queryForApi);
        setSearchError(null);
        setIsSearching(false);
      } catch (err: unknown) {
        if (isAbortError(err) || controller.signal.aborted) {
          // No apagar loading si ya hay otra búsqueda vigente (el usuario sigue escribiendo).
          return;
        }
        if (seq !== requestSeqRef.current) return;
        setResults([]);
        setSettledQuery(queryForApi);
        setSearchError(
          err instanceof Error && err.message
            ? err.message
            : 'No se pudo buscar clientes. Inténtalo de nuevo.',
        );
        setIsSearching(false);
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      // Al cambiar la query, aborta el fetch anterior (el servidor sigue calentando la cartera en inflight).
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [
    shouldSearch,
    queryForApi,
    userId,
    businessId,
    debounceMs,
    resultLimit,
    blocksSearch,
    trimmed,
    matchByName,
    includeLegacy,
    fallbackAll,
  ]);

  useEffect(() => {
    return () => {
      requestSeqRef.current += 1;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = null;
    };
  }, []);

  const selectClient = useCallback((client: Client) => {
    // Atención rápida / walk-in: fuera de este hook (flujo paralelo en TPV).
    if (isSyntheticTpvClientId(client?.id)) return;
    requestSeqRef.current += 1;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    setSelectedClient(client);
    setResults([]);
    setSettledQuery('');
    setIsSearching(false);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedClient(null);
  }, []);

  const clearResults = useCallback(() => {
    requestSeqRef.current += 1;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    setResults([]);
    setSettledQuery('');
    setIsSearching(false);
    setSearchError(null);
  }, []);

  return {
    results,
    isSearching,
    settledQuery,
    searchError,
    selectedClient,
    selectClient,
    clearSelection,
    clearResults,
  };
}
