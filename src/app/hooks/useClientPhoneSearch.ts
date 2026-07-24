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

/** Walk-in / atención rápida del TPV: no deben impedir buscar un cliente real. */
export function clientSelectionBlocksPhoneSearch(client: Client | null | undefined): boolean {
  if (!client) return false;
  return !String(client.id || '').startsWith('tpv-');
}

function cacheKey(userId: string, businessId: string | undefined, query: string, limit: number) {
  return `${userId}|${businessId || ''}|${limit}|${query}`;
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
   * (La atención rápida ya no mete cliente sintético en este estado.)
   */
  keepSearchingWhileSelected?: boolean;
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
      // Si solo salimos del paso cliente (enabled=false), NO borrar results/settled:
      // al volver con el mismo texto debe poder reutilizar o re-buscar sin quedar «ciego».
      // Solo limpiar cuando no hay query / no hay userId / bloqueo por selección.
      if (!trimmed || !userId || blocksSearch) {
        setResults([]);
        setSettledQuery('');
        setSearchError(null);
      }
      return;
    }

    const key = cacheKey(userId, businessId, queryForApi, resultLimit);
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

    const seq = ++requestSeqRef.current;

    timerRef.current = setTimeout(async () => {
      if (seq !== requestSeqRef.current) return;
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsSearching(true);
      setSearchError(null);
      try {
        let payload = await searchClientsByPhoneRequest(
          userId,
          queryForApi,
          resultLimit,
          controller.signal,
          businessId,
          { includeLegacy: true, fallbackAll: true },
        );
        const lastRefresh = portfolioRefreshAtByUser.get(userId) || 0;
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
            { includeLegacy: true, fallbackAll: true, refresh: true },
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
          if (seq === requestSeqRef.current) setIsSearching(false);
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
