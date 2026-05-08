import { useState, useEffect, useRef, useCallback } from 'react';
import { searchClientsByPhoneRequest } from '../lib/crmApi';
import type { Client } from '../context/AppContext';

export interface ClientPhoneSearchResult {
  results: Client[];
  isSearching: boolean;
  selectedClient: Client | null;
  selectClient: (client: Client) => void;
  clearSelection: () => void;
  clearResults: () => void;
}

export function useClientPhoneSearch(params: {
  userId: string;
  phone: string;
  enabled?: boolean;
  debounceMs?: number;
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
    enabled = true,
    debounceMs = 300,
    minDigits = 3,
    matchByName = false,
    minQueryLength = 2,
  } = params;
  const [results, setResults] = useState<Client[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trimmed = phone.trim();
  const digits = phone.replace(/\D/g, '');
  const queryForApi = matchByName ? trimmed : digits;
  const shouldSearch =
    enabled &&
    !!userId &&
    !selectedClient &&
    (matchByName ? trimmed.length >= minQueryLength : digits.length >= minDigits);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!shouldSearch) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    timerRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const clients = await searchClientsByPhoneRequest(userId, queryForApi, 8, controller.signal);
        if (!controller.signal.aborted) {
          setResults(clients);
          setIsSearching(false);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setResults([]);
          setIsSearching(false);
        }
      }
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [shouldSearch, queryForApi, userId, debounceMs, selectedClient]);

  const selectClient = useCallback((client: Client) => {
    setSelectedClient(client);
    setResults([]);
    setIsSearching(false);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedClient(null);
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
    setIsSearching(false);
  }, []);

  return { results, isSearching, selectedClient, selectClient, clearSelection, clearResults };
}
