import { useState, useEffect, useRef, useCallback } from 'react';
import { searchClientsByPhoneRequest } from '../lib/crmApi';
import type { Client } from '../context/AppContext';

export interface ClientPhoneSearchResult {
  results: Client[];
  isSearching: boolean;
  searchError: string | null;
  selectedClient: Client | null;
  selectClient: (client: Client) => void;
  clearSelection: () => void;
  clearResults: () => void;
}

/** Cache corto en el navegador para no repetir la misma query en ráfaga. */
const CLIENT_SEARCH_CACHE_TTL_MS = 45_000;
const CLIENT_SEARCH_CACHE_MAX = 40;
const clientSearchResultCache = new Map<string, { at: number; clients: Client[] }>();

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
  } = params;
  const [results, setResults] = useState<Client[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);
  const trimmed = phone.trim();
  const digits = phone.replace(/\D/g, '');
  const queryForApi = matchByName ? trimmed : digits;
  const blocksSearch = clientSelectionBlocksPhoneSearch(selectedClient);
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
      setResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    const key = cacheKey(userId, businessId, queryForApi, resultLimit);
    const cached = readSearchCache(key);
    if (cached) {
      requestSeqRef.current += 1;
      if (abortRef.current) abortRef.current.abort();
      setResults(cached);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    const seq = ++requestSeqRef.current;

    timerRef.current = setTimeout(async () => {
      if (seq !== requestSeqRef.current) return;
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        let clients = await searchClientsByPhoneRequest(
          userId,
          queryForApi,
          resultLimit,
          controller.signal,
          businessId,
          { includeLegacy: true, fallbackAll: true },
        );
        // Si la caché servidor quedó vacía, un refresh recupera carteras reales (Pau ~6k).
        if (clients.length === 0 && !controller.signal.aborted && seq === requestSeqRef.current) {
          clients = await searchClientsByPhoneRequest(
            userId,
            queryForApi,
            resultLimit,
            controller.signal,
            businessId,
            { includeLegacy: true, fallbackAll: true, refresh: true },
          );
        }
        if (controller.signal.aborted || seq !== requestSeqRef.current) return;
        // No cachear vacíos: evita “no hay clientes” pegado tras un fallo de filtro/red.
        if (clients.length > 0) writeSearchCache(key, clients);
        setResults(clients);
        setSearchError(null);
        setIsSearching(false);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (controller.signal.aborted || seq !== requestSeqRef.current) return;
        setResults([]);
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
      if (abortRef.current) abortRef.current.abort();
    };
  }, [shouldSearch, queryForApi, userId, businessId, debounceMs, resultLimit, selectedClient]);

  const selectClient = useCallback((client: Client) => {
    requestSeqRef.current += 1;
    if (abortRef.current) abortRef.current.abort();
    setSelectedClient(client);
    setResults([]);
    setIsSearching(false);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedClient(null);
  }, []);

  const clearResults = useCallback(() => {
    requestSeqRef.current += 1;
    if (abortRef.current) abortRef.current.abort();
    setResults([]);
    setIsSearching(false);
    setSearchError(null);
  }, []);

  return {
    results,
    isSearching,
    searchError,
    selectedClient,
    selectClient,
    clearSelection,
    clearResults,
  };
}
